import { Client } from "node-osc";
import {PythonShell} from 'python-shell';
import * as fs from 'node:fs';
import {parse} from 'yaml';
import chalk from 'chalk';
import dbus, {ProxyObject, sessionBus, Variant } from "dbus-next";

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
};
type PlaybackStatus = "Playing" | "Paused" | "Stopped";

interface Music {
	Author: string,
	Title: string,
	Position: [number, number]
}
class VRCOSC {
	private displayedTime: number | null = null;
	private lastReport: number | null = null;
	public counter = 0;
	private loggedNewSong = "";
	
	handleTemplate(type: "Playing" | "NotPlaying", music?: Music) {
		const templatesFile = parse(fs.readFileSync("templates.yaml", "utf8"));
		const playing = templatesFile.playing.map((template: string) =>
			template.replace(/\{(\w+)}/g, '{$1}')
		);
		const np = templatesFile.notPlaying;
		if (this.counter % 5 === 0)
			console.log(chalk.blue(`Progressing Template... ${
				type == "Playing" ? `${this.counter/5 % playing.length + 1} / ${playing.length}` :
				type == "NotPlaying" ? `${this.counter/5 % np.length + 1} / ${np.length}` :
				"Unknown Type"
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
		return temp;
	}
	
	Playing(music: Music) {
		if (this.loggedNewSong === "" || this.loggedNewSong !== music.Title) {
			console.log(chalk.green(`Playing ${music.Title} by ${music.Author}...`));
			this.loggedNewSong = music.Title;
		}
		const template = this.handleTemplate("Playing", music);
		return client.send("/chatbox/input", template, true, false);
	}
	notPlaying() {
		if (this.loggedNewSong !== "") {
			console.log(chalk.red(`Playing has stopped...`));
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

	async listNames(bus: dbus.MessageBus): Promise<string[]> {
		const obj = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
		const iface = obj.getInterface("org.freedesktop.DBus") as any;
		return await iface.ListNames(); // PascalCase, not camelCase
	}

	async getProps(bus: dbus.MessageBus, name: string) {
		const obj: ProxyObject = await bus.getProxyObject(name, "/org/mpris/MediaPlayer2");
		return obj.getInterface("org.freedesktop.DBus.Properties") as any;
	}

	async musicRequest(): Promise<NowPlaying | "np"> {
		const uid = process.getuid?.() ?? Number(process.env.UID || 1000);
		const runtime = process.env.XDG_RUNTIME_DIR || `run/user/${uid}`;
		const addr = `unix:path=${runtime}/bus`;
		process.env.DBUS_SESSION_BUS_ADDRESS = addr;
		const bus = sessionBus();
		
		const names = await this.listNames(bus);
		const players = names.filter(n => n.startsWith("org.mpris.MediaPlayer2."));
		
		// Prefer firefox if present, else first player
		const firefox = players.find(n => /^org\.mpris\.MediaPlayer2\.firefox\./.test(n));
		const chosen = firefox || players[0];
		if (!chosen) {
			return "np";
		}
		
		const props = await this.getProps(bus, chosen);
		
		const statusVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus");
		const status = statusVar.value as PlaybackStatus;
		
		const mdVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "Metadata");
		const md = mdVar.value as Record<string, unknown>;
		
		const title = (md["xesam:title"] as Variant).value || "";
		const artistArr = (md["xesam:artist"] as Variant);
		const artist = artistArr.value[0] || "";
		
		if (status !== "Playing") {
			return "np";
		}
		
		const lengthUs = Number((md["mpris:length"] as Variant).value || 0);
		const posVar: Variant = await props.Get("org.mpris.MediaPlayer2.Player", "Position");
		const posUs = Number(posVar.value || 0);
		const usToMs = (us: number) => Math.floor(us / 1000);
		
		const out: any = {
			Author: artist,
			Title: title,
			Position: lengthUs > 0 ? [usToMs(posUs), usToMs(lengthUs)] : ["LIVE"]
		};
		
		return out;
	}
}

const osc = new VRCOSC();
setInterval(async () => {
	if (process.platform != "win32") {
		const music = await osc.musicRequest();
		if (music == "np")
			osc.notPlaying();
		else
			osc.Playing(music);
	} else {
		await PythonShell.run("media.py", {mode: "text", pythonOptions: ["-u"]}).then((r) => {
			const parsedData = JSON.parse(r[0]);
			if (parsedData.Paused) {
				osc.notPlaying();
			} else {
				osc.Playing(parsedData);
			}
		});
	}
	osc.counter++;
}, 1500);