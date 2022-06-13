# expo-audio-hooks

React hooks for expo-av audio.

## Installation

`yarn add expo-av expo-audio-hooks`

> `expo-av` is a peer dependency and needs to be installed explicitly

## Quick Start

```js
import useAudio from 'expo-audio-hooks';

function App() {
  const { play, pause, isLoadingAudio } = useAudio(
    { uri: 'https://www.bensound.com/bensound-music/bensound-oblivion.mp3' }
  );

  if (isLoadingAudio) return <Text>Loading...</Text>

  return (
    <View>
      <Text onPress={play}>Play</Text>
      <Text onPress={pause}>Pause</Text>
    </View>
  );
}
```

## Example - A song player

```js
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import useAudio from 'expo-audio-hooks';

export default function App() {
  const songList = [
    'https://www.bensound.com/bensound-music/bensound-oblivion.mp3',
    'https://www.bensound.com/bensound-music/bensound-shouldacoulda.mp3',
    'https://www.bensound.com/bensound-music/bensound-supercool.mp3',
  ];
  const [songIndex, setSongIndex] = useState(0);
  const { isLoadingAudio, isPlaying, setIsPlaying } = useAudio({ uri: songList[songIndex] });

  const togglePlay = () => {
    setIsPlaying((value) => !value);
  };

  const goToNextSong = () => {
    setSongIndex((index) => (index + 1) % songList.length);
  };

  if (isLoadingAudio) return <Text>Loading...</Text>

  return (
    <View style={styles.container}>
      <Text>Song #{songIndex}</Text>
      <Text onPress={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</Text>
      <Text onPress={goToNextSong}>Next Song</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    flexDirection: 'row',
  },
});
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