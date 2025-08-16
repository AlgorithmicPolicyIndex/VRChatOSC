# VRChat OSC
This is a personal project I'm making, purely for the customizability and need to make something more user friendly for myself.  
While this may turn into something similar to my [ChatPlays](https://github.com/AlgorithmicPolicyIndex/ChatPlays) project where I might build an entire frontend for it, right now it's purely backend.

If you would like to know why I made an OSC class, it's because I know I will work more on this to do more with OSC.  
Especially if people want to create their own custom OSC connections outside just using the chat intput.

# To Use
Check out [package.json](package.json) in section "Scripts"  
There are currently `build` and `start`   
- `build` Will build the `src` folder to a `build` folder
- `start` Will run the `build/index.js`

`npm run build && npm run start` will build and start the script in one command.  
After this you can just run `npm run start` as long as you update the [index.ts](src/index.ts) file.

# Edits
If you wish to change things, such as adding a custom placeholder, you can do so in the index.ts file.  
Right now the only available placeholders are in the [Templates](templates.yaml) file:
- {song_position}
- {song_artist}
- {song_title}