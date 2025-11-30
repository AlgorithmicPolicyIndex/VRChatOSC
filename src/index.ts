import { Client } from "node-osc";
import * as fs from 'node:fs';
import {parse} from 'yaml';
import dbus, {ProxyObject, sessionBus, Variant } from "dbus-next";
import {PlaybackStatus, SMTCMonitor} from "@coooookies/windows-smtc-monitor";
import {PythonShell} from "python-shell";
import path from "node:path";

let _chalk: any;
async function getChalk() {
    if (!_chalk) _chalk = (await import("chalk")).default;
    return _chalk;
}

const client = new Client("127.0.0.1", 9000);
const placeholders = [
	"song_position",
	"song_artist",
	"song_title"
]

interface NowPlaying {
	Author: string;
	Title: string,
	Position: [number, number],
	Thumbnail?: string;
}
type PlaybackStatusL = "Playing" | "Paused" | "Stopped";

interface Music {
	Author: string,
	Title: string,
	Position: [number, number]
}
class VRCOSC {
	private yaml = parse(fs.readFileSync("templates.yaml", "utf8"));
	private displayedTime: number | null = null;
	private lastReport: number | null = null;
	private counter = 0;
	private loggedNewSong = "";
	private initial = false;

	constructor() {
		getChalk();
		setInterval(async () => {
			await this.run();
		}, 1500);
	}

	async run() {
		let request: Music | "np" = "np";
		if (process.platform === "linux") {
			request = await this.LinuxRequest();
		} else if (process.platform === "win32") {
			if (this.yaml.usePython as string) {
				request = await this.pythonRequest();
			} else {
				request = await this.WindowsRequest();
			}
		}

		if (request == "np") {
			this.notPlaying();
		} else {
			this.Playing(request);
		}
		++this.counter;
	}

	handleTemplate(type: "Playing" | "NotPlaying", music?: Music) {
		const playing = this.yaml.playing.map((template: string) =>
			template.replace(/\{(\w+)}/g, '{$1}')
		);
		const np = this.yaml.notPlaying;
		if (this.counter % 5 === 0)
			console.log(_chalk.blue(`Progressing Template... ${
				type == "Playing"
					? `${this.counter/5 % playing.length + 1} / ${playing.length}`
					: `${this.counter/5 % np.length + 1} / ${np.length}`
			}`));
		
		if (type === "NotPlaying") {
			return np[Math.floor(this.counter/5) % np.length];
		}
		
		if (!music)
			throw new Error("No Music Data in 'Playing' Type");
		if (!this.displayedTime) this.displayedTime = music.Position[0];
		if (this.lastReport === music.Position[0]) {
			this.displayedTime += 1.5 * 1000;
		} else {
			this.lastReport = music.Position[0];
			this.displayedTime = music.Position[0];
		}
		
		let temp = playing[Math.floor(this.counter/5) % playing.length];
		placeholders.forEach((placeholder) => {
			temp = temp.replace(`{${placeholder}}`, 
				placeholder === "song_artist" ? music.Author :
				placeholder === "song_title" ? music.Title :
				placeholder === "song_position" ? `${this.msToTimeString(this.displayedTime as number)}/${this.msToTimeString(music.Position[1])}` :
				""
			);	
		});

		// TODO: This is for only just some characters that VRChat doesn't handle. The characters in the template examples are all visible in VRChat
		// const reg = /[^\x00-\x7F]+/g;
		// if (reg.test(temp)) {
		// 	console.log(`This Template contains non-ascii characters and will be stripped from the string.\nList of characters: ${temp.match(reg)}\nTemplate: ${type}\n${temp}`);
		// 	temp.replace(reg, "");
		// }
		if (temp.length > 144) throw new Error(`Unable to use Template: ${type}\n${temp}`);
		return temp;
	}
	
	Playing(music: Music) {
		if (this.loggedNewSong === "" || this.loggedNewSong !== music.Title) {
			console.log(_chalk.green(`Playing ${music.Title} by ${music.Author}...`));
			this.loggedNewSong = music.Title;
		}
		const template = this.handleTemplate("Playing", music);
		return client.send("/chatbox/input", template, true, false);
	}
	notPlaying() {
		if (this.loggedNewSong !== "") {
			console.log(_chalk.red(`Playing has stopped...`));
			this.loggedNewSong = "";
		}
		const template = this.handleTemplate("NotPlaying");
		return client.send("/chatbox/input", template, true, false);
	}
	
	msToTimeString(ms: number) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	async WindowsRequest(): Promise<NowPlaying | "np"> {
		const CurrentMedia = SMTCMonitor.getCurrentMediaSession();

		if (!CurrentMedia) return "np";
		switch (CurrentMedia.playback.playbackStatus) {
			case PlaybackStatus.PAUSED: return "np";
		}

		return {
			Author: CurrentMedia.media.artist,
			Title: CurrentMedia.media.title,
			Position: [
				CurrentMedia.timeline.position * 1000,
				CurrentMedia.timeline.duration * 1000
			]
		};
	}
	async pythonRequest(): Promise<Music> {
		return await PythonShell.run(path.join(__dirname, "..", "src", "media.py"), { mode: "text", pythonOptions: ["-u"]}).then(result => {
			console.log("Using Python...");
			return JSON.parse(result[0]);
		});
	}

	async listNames(bus: dbus.MessageBus): Promise<string[]> {
		const obj = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
		const iface = obj.getInterface("org.freedesktop.DBus") as any;
		return await iface.ListNames(); // PascalCase, not camelCase
	}

	async getProps(bus: dbus.MessageBus, name: string) {
		const obj: ProxyObject = await bus.getProxyObject(name, "/org/mpris/MediaPlayer2");
		return obj.getInterface("org.freedesktop.DBus.Properties") as any;
	}

	async LinuxRequest(): Promise<NowPlaying | "np"> {
		const uid = process.getuid?.() ?? Number(process.env.UID || 1000);
		const runtime = process.env.XDG_RUNTIME_DIR || `run/user/${uid}`;
		const addr = `unix:path=${runtime}/bus`;
		process.env.DBUS_SESSION_BUS_ADDRESS = addr;
		const bus = sessionBus();
		
		const names = await this.listNames(bus);
		const players = names.filter(n => n.startsWith("org.mpris.MediaPlayer2."));

		const chosen = players[0];
		if (!chosen) {
			return "np";
		}
		
		const props = await this.getProps(bus, chosen);
		
		const statusVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus");
		const status = statusVar.value as PlaybackStatusL;
		
		const mdVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "Metadata");
		const md = mdVar.value as Record<string, unknown>;
		
		const title = (md["xesam:title"] as Variant).value || "";
		const artistArr = (md["xesam:artist"] as Variant);
		const artist = artistArr.value[0] || "";
		
		if (status !== "Playing") return "np";
		
		const lengthUs = Number((md["mpris:length"] as Variant).value || 0);
		const posVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "Position");
		const posUs = Number(posVar.value || 0);
		const usToMs = (us: number) => Math.floor(us / 1000);
		
		const out: any = {
			Author: artist,
			Title: title,
			Position: lengthUs > 0 ? [usToMs(posUs), usToMs(lengthUs)] : ["LIVE"]
		};
		
		if (!this.initial) {
			console.error(`BUS: ${addr}\nPlayers: ${players}\nStatus: ${status}\nSong Data: ${JSON.stringify(out)}\n`);
			this.initial = true;
		}

		return out;
	}
}

new VRCOSC();
