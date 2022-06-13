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

[Online Demo](https://snack.expo.dev/@loureirorg/example-expo-audio-hooks)

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

- Add tests;
- Typescript;
- GitHub Actions (testing, auto update dependencies);
- Document all exported methods;
- `errorAudio` object, containing initialization errors (ex. file not found, unsupported format, etc);
- `skip` option, to not load the file (like Apollo Hooks);
- `cancel` method, to abort current loading;
- `stop` method, which is equivalent to `pause() + seek(0)`;
- Check if we can remove or improve the workarounds (see list below);
- Extra effects, like volume, fade in, fade out. Ex. `pauseWithFade(timeMs)`;
- Document how to do standard actions, like to set a loop;

## List of Workarounds

The current code works with a few workarounds to deal with I believe are limitations and/or bugs of the `expo-av` library. It would be great to remove or improve them.

Feel free to work on them and submit PRs, or to suggest ideas on how to improve them.

### Workaround 1: Can't cancel an ongoing loading

According to [this reply](https://stackoverflow.com/a/64400627/1772990) on StackOverflow, there's no way to cancel an already loading audio.

This means if the user start loading a huge mp3 in a slow network and quickly switches to another mp3, the first download will not be cancelled. It will proceed downloading, even though it is not necessary anymore.

We need to cancel `loadAsync` in situations like: the component is destroyed (unmounted), the source has changed.

To deal with these situations, we implemented the suggested workaround: we wait for the download to finish and then we destroy the object. We detect the download has finished with code on `setOnPlaybackStatusUpdate`.

Besides the performance issue, this workaround adds a huge chunk of complexity in the `useAudio` library. We had to implement a queue of pending audio resources, check when the download finishes, etc.

I wonder if there is another way. We have to take a look at the code in expo-av:
[https://github.com/expo/expo/blob/main/packages/expo-av/src/Audio/Sound.ts](https://github.com/expo/expo/blob/main/packages/expo-av/src/Audio/Sound.ts)

An alternative is to download the file with `fetch` and pass the downloaded file to `loadAsync`. Then we can apply `AbortController` on `fetch` when needed.

The downside of this alternative is that we lose buffering (do we or can we pass a resource that is still downloading?). And without buffering, it can take a long time with really large files in slow networks, and be problematic in terms of memory and space in low-end devices.

### Workaround 2: Unexpected `Cannot complete operation because sound is not loaded`

Sometimes the audio methods `pause`/`play`/`stop` throw the `sound is not loaded` exception.

According to the expo-av source code ([Audio/Sound.ts#114](https://github.com/expo/expo/blob/main/packages/expo-av/src/Audio/Sound.ts#L114)), this happens because the audio file has not finished loading.

Expo knows when the loading has finished with the private property `_loaded`.

Although the concept is correct, it seems to have a bug with the current expo-av implementation (Jun 2022, version 11.2.2) that incorrectly sets `_loaded` as false even if it is loaded.

For example, sometimes this code generates the exception:
```js
const externalFile = { uri: '...' };
const song = new Audio.Sound();
await sound.loadAsync(externalFile);
const status = sound.getStatusAsync();
try {
  sound.playAsync();
} catch (error) {
  console.error(error);
  console.log(status);
}
```

On the `status` return, `isLoaded` is true, but because the exception happens, we know `_loaded` is false.

So there are two problems:
- Either `loadAsync` is returning before it has finished loading or `_loaded` is not set to `true` after finishing loading. Either way is wrong;
- `status.isLoading` has a different value than `_loaded`. In my understanding, `status.isLoading` is the public version of the private `_loaded` property. If this is correct, than there's another bug here.

I noticed this exception happening in two different occasions:
- Calling play/pause just after loading the file;
- Calling play/pause after the song has finished playing, leaving the app aside for a while, and then refreshing the expo code (by saving a source file with the player open);

I thought reporting this bug to the Expo team, but there's a disclaimer saying they will ignore the report unless I can provide a reproductible bug code, which is hard to develop (the bug happens sometimes) and would take a long time to do (we may would have to debug native Android/iOS code).

The way we fixed this bug was to check `status.isLoading` and also to wrap code on a `try/catch`. And we also check the `isLoadingAudio` state that is set after `loadAsync`.

This triple check (`isLoadingAudio`, `status.isLoading`, `try/catch`) avoids the exception crashing the app, but when it happens, it makes the play/pause commands be ignored. This happens more usually after loading the audio file and playing/pausing right away, but also after saving source-code with the player opened.

An alternative to improve this is to replace the three checks with just the `try/catch` block alone. The other two are not reliable anyway.

### Workaround 3: The bug watchdog

The `sound is not loaded` bug makes the play/pause commands to be ignored sometimes. As a solution, I implemented a watchdog. It's a setInterval executed every 500 milliseconds or so.

Its code does this:

```js
isPlaying ? song.playAsync() : song.pauseAsync()
```

This means when a play/pause command is ignored, this watchdog will retry every 500ms.

A better approach for this is to detect the command was ignored (`catch` block) and set a `setTimeout` to retry again in 500ms, but only once. If an exception occurs while retrying, it triggers another try in 500ms and so on.

This is less resource-intensive than always be checking every 500ms.

## License

MIT

[expo-av Audio]: https://docs.expo.dev/versions/latest/sdk/audio/