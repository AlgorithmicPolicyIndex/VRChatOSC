import { Client } from "node-osc";
import {PythonShell} from 'python-shell';
import * as fs from 'node:fs';
import {parse} from 'yaml';

const client = new Client("127.0.0.1", 9000);
const placeholders = [
	"song_position",
	"song_artist",
	"song_title"
]

interface Music {
	Author: string,
	Title: string,
	Position: number[]
}
class VRCOSC {
	private displayedTime: number | null = null;
	private lastReport: number | null = null;
	private counter = 0;
	private loggedNewSong = "";
	public changeTemplate = false;
	
	update() {
		this.counter++;
		if ( this.counter % 5 === 0 )  {
			return osc.changeTemplate = true;
		}
		return;
	}
	
	handleTemplate(type: "Playing" | "NotPlaying", music?: Music) {
		const templatesFile = fs.readFileSync("templates.yaml", "utf8");
		
		if (type === "NotPlaying") {
			const np = parse(templatesFile).notPlaying;
			return np[Math.floor(this.counter/5) % np.length];
		}
		
		const playing = parse(templatesFile).playing.map((template: string) => 
			template.replace(/\{(\w+)}/g, '{$1}')
		);
		
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
		
		this.changeTemplate = false;
		return temp;
	}
	
	Playing(music: Music) {
		if (this.loggedNewSong === "" || this.loggedNewSong !== music.Title) {
			console.log(`Playing ${music.Title} by ${music.Author}...`);
			this.loggedNewSong = music.Title;
		}
		const template = this.handleTemplate("Playing", music);
		return client.send("/chatbox/input", template, true, false);
	}
	notPlaying() {
		if (this.loggedNewSong !== "") {
			console.log(`Playing has stopped...`);
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
}

const osc = new VRCOSC();
setInterval(async () => {
	osc.update();
	
	await PythonShell.run("src/media.py", {mode: "text", pythonOptions: ["-u"]}).then((r) => {
		const parsedData = JSON.parse(r[0]);
		if (parsedData.Paused) {
			osc.notPlaying();
		} else {
			osc.Playing(parsedData);
		}
	});
}, 1500);