# VRChat OSC
This is a personal project I'm making, purely for the customizability and need to make something more user friendly for myself.  
While this may turn into something similar to my [ChatPlays](https://github.com/AlgorithmicPolicyIndex/ChatPlays) project where I might build an entire frontend for it, right now it's purely backend.

If you would like to know why I made an OSC class, it's because I know I will work more on this to do more with OSC.  
Especially if people want to create their own custom OSC connections outside just using the chat intput.

# Features
- Supports
  - Windows
  - Linux
- Media
  - Templates to display current Song ingo
  - Not Playing Templates

# Plans
- Paused Template, or update song_position so that it says "Paused"

# To Use
<sup>You can check out the [Releases](https://github.com/AlgorithmicPolicyIndex/VRChatOSC/releases) for the latest version and already built JS and Python File.</sup>  
You will need npm or a similar package manager.
`npm install` via [NodeJS](https://nodejs.org/)

<sub><b>WINDOWS ONLY</b>  
Python isn't specifically needed anymore, as I'm trying to remove the need for Python.  
For right now, if it doesn't work; update [index.ts](src/index.ts) usePython -> `true`</sub>

You will also need [Python](https://www.python.org/downloads/)  
<sup>This is purely for the fact I use Python to gather Media info</sup>  
You can install required packages via `pip install -r requirements.txt`

Check out [package.json](package.json) in section "Scripts"  
There are currently `build` and `start`   
- `build` Will build the `src` folder to a `build` folder
- `start` Will run the `build/index.js`

`npm run build && npm run start` will build and start the script in one command.  
After this you can just run `npm run start` as long as you don't update the [index.ts](src/index.ts) file.

# Edits
If you wish to change things, such as adding a custom placeholder, you can do so in the index.ts file.  
Right now the only available placeholders are in the [Templates](templates.yaml) file:
- {song_position}
- {song_artist}
- {song_title}