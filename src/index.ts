import { Client } from "node-osc";
import {PythonShell} from 'python-shell';
import * as fs from 'node:fs';
import {parse} from 'yaml';
import chalk from 'chalk';

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
}

const osc = new VRCOSC();
setInterval(async () => {	
	await PythonShell.run("media.py", {mode: "text", pythonOptions: ["-u"]}).then((r) => {
		const parsedData = JSON.parse(r[0]);
		if (parsedData.Paused) {
			osc.notPlaying();
		} else {
			osc.Playing(parsedData);
		}
		osc.counter++;
	});
}, 1500);