# expo-audio-hooks

React hooks for expo-av audio.

## Installation

`npm install expo-av expo-audio-hooks`

> `expo-av` is a peer dependency and needs to be installed explicitly

## Quick Start

```js
import useAudio from 'expo-audio-hooks';

function App() {
  const { play, pause, isLoadingAudio } = useAudio(
    {{ uri: 'https://p.scdn.co/mp3-preview/f7a8ab9c5768009b65a30e9162555e8f21046f46?cid=162b7dc01f3a4a2ca32ed3cec83d1e02' }}
  );

  if (isLoadingAudio) return <p>Loading...</p>

  return (
    <div>
      <button onClick={play}>play</button>
      <button onClick={pause}>pause</button>
    </div>
  )
}
```

## Example - A song player
```js
import useAudio from 'expo-audio-hooks';

function App() {
  const songList = [
    'https://www.bensound.com/bensound-music/bensound-oblivion.mp3',
    'https://www.bensound.com/bensound-music/bensound-shouldacoulda.mp3',
    'https://www.bensound.com/bensound-music/bensound-supercool.mp3',
  ];
  const [songIndex, setSongIndex] = useState(0);
  const { isLoadingAudio, setIsPlaying } = useAudio({{ uri: songList[songIndex] }});

  const togglePlay = () => {
    setIsPlaying((value) => !value);
  };

  const goToNextSong = () => {
    setSongIndex((index) => (index + 1) % songList.length);
  };

  if (isLoadingAudio) return <p>Loading...</p>

  return (
    <div>
      <p>Song #{songIndex}</p>
      <button onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
      <button onClick={goToNextSong)}>Next Song</button>
    </div>
  )
}
```

## API

The package exports one default export and named exports:

```js
import useAudio from 'expo-audio-hooks'
```

### useAudio(resource, options)

The main React hook to execute an audio.

- `resource` - The resource. It can be a URI (stream) or a local audio file.
- `options` - An options object.
  - `autoPlay` ( `false` ) - If true, the audio will be executed automatically after loading.

**Returns**

```js
{
    play,
    pause,
    seek,
    unload,
    isPlaying,
    setIsPlaying,
    isLoadingAudio,
    setOnPlaybackStatusUpdate,
    setOnPlaybackTimeUpdate,
}
```

## Why?

It's common to experience crashes and exceptions when working with `expo-av`. Most of the issues are related with asynchronicity, especially when switching to a new audio source while still loading a previous one.

To properly handle expo-av's asynchronicity, it is necessary to add a quite amount of boilerplate, most of it not obvious unless you have deep understanding of `expo-av`.

This library simplifies the usage of `expo-av`.

## To-Do

- Add tests
- Typescript
- GitHub Actions (testing, auto update dependencies)
- Document all exported methods

## License

MIT

[expo-av Audio]: https://docs.expo.dev/versions/latest/sdk/audio/