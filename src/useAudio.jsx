import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';

function useAudio(audioResource, settings = {}) {
  const audioObject = useRef(null);
  const currentAudioResource = useRef(null);
  const nextAudioResource = useRef(null);
  const isReadyForNextResource = useRef(true);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isMounted = useRef(false);
  const [bugWatchdogCounter, setBugWatchdogCounter] = useState(0);
  const userOnPlaybackTimeUpdate = useRef(null);
  const userOnPlaybackStatusUpdate = useRef(null);

  // current status of the component
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // the expo-av bug watchdog
  // expo-av has a few bugs that cause the audio to not play or pause when requested.
  // this is a workaround that checks the audio status every n ms and force a play/pause action.
  useEffect(() => {
    const timerHandler = setInterval(() => {
      setBugWatchdogCounter((value) => value + 1);
    }, 500);

    return () => clearInterval(timerHandler);
  }, []);

  // merge user settings with default settings
  const componentSettings = useMemo(() => {
    const defaultSettings = {
      autoPlay: false,
    };

    return {
      ...defaultSettings,
      ...settings,
    };
  }, [settings]);

  // check if the user has defined the audio resource
  const isResourceDefined = useMemo(() => {
    // if the audio resource is null or undefined, return false
    if (!audioResource) {
      return false;
    }

    // if the audio resource has a uri, it's a streaming audio
    if ('uri' in audioResource) {
      return !!audioResource.uri;
    }

    // if the audio resource is not null nor a streaming, it is a local file
    return true;
  }, [audioResource]);

  // check if two audio resources are the same
  function checkSameAudioResources(resource1, resource2) {
    if (!resource1 || !resource2) {
      return false;
    }

    const isResourcesStreaming = ('uri' in resource1) && ('uri' in resource2);
    if (isResourcesStreaming) {
      return resource1.uri === resource2.uri;
    }

    return resource1 === resource2;
  }

  // unload and free audio resources
  const unload = useCallback(async () => {
    // safe guard to not unload the audio object if not initialized
    if (!audioObject.current) {
      return;
    }

    // only call `stop` if the audio is loaded
    const status = await audioObject.current.getStatusAsync();
    if (status.isLoaded) {
      await audioObject.current.stopAsync();
    }

    // unload the audio object
    await audioObject.current.unloadAsync();

    // check if component is still mounted before changing a state
    if (!isMounted.current) {
      return;
    }

    // clear the audio object
    audioObject.current = null;
    currentAudioResource.current = null;
  }, []);

  // unload audio when unmount the component
  useEffect(() => unload, [unload]);

  // play/pause the audio according to isPlaying status
  useEffect(() => {
    const playOrPause = async () => {
      // safe guard to not call audio object if not initialized
      const isAudioObjectDefined = !!audioObject.current;
      if (!isAudioObjectDefined) {
        return;
      }

      // safe guard to not call if in process of canceling current audio resource
      if (!isReadyForNextResource.current) {
        return;
      }

      // safe guard to not call if the audio is not loaded
      // due to async, sometimes `isLoadingAudio` is false but the audio is not loaded yet
      const status = await audioObject.current.getStatusAsync();
      if (isLoadingAudio || !status.isLoaded) {
        return;
      }

      // play/pause the audio
      try {
        if (isPlaying) {
          await audioObject.current.playAsync();
        } else {
          await audioObject.current.pauseAsync();
        }
      } catch {
        // bug on expo-av: status not always return correct value for `isLoaded`
        // it's okay to ignore the exception as we would skip the play/pause action anyway
      }
    };
    playOrPause();
  }, [isLoadingAudio, isPlaying, bugWatchdogCounter]);

  // onStatusUpdate callback
  const onPlaybackStatusUpdate = useCallback((status) => {
    // provides the current playback time
    if (userOnPlaybackTimeUpdate.current) {
      const positionMillis = status.positionMillis ?? 0;
      const durationMillis = Number.isNaN(status.durationMillis) ? 1 : status.durationMillis ?? 1;
      const remainingMillis = durationMillis - positionMillis;
      userOnPlaybackTimeUpdate.current({ positionMillis, durationMillis, remainingMillis });
    }

    if (userOnPlaybackStatusUpdate.current) {
      userOnPlaybackStatusUpdate.current(status);
    }
  }, []);

  // create the audio object when the audio resource changes.
  // if an audio object already exists, stops and unload it before creating a new one.
  // because expo-av doesn't support canceling a loading resource, we implement a queue system.
  // we put the new audio resource in a queue and process it when the previous one has
  // finished loading and is destroyed.
  useEffect(() => {
    // wait until we have an audio source
    if (!isResourceDefined) {
      return;
    }

    // check if changed the audio resource.
    // this effect is triggered on many different state changes.
    // we only take action if the audio resource changed.
    const isSameResource = checkSameAudioResources(currentAudioResource.current, audioResource);
    if (isSameResource) {
      return;
    }

    // put resource in queue to be loaded next.
    const isAlreadyNext = checkSameAudioResources(nextAudioResource.current, audioResource);
    if (isAlreadyNext) {
      return;
    }
    nextAudioResource.current = audioResource;

    // still processing the previous resource.
    if (!isReadyForNextResource.current) {
      return;
    }

    // function to load the next resource
    async function createAudioObjectFromQueue() {
      try {
        // update loading status
        setIsLoadingAudio(true);

        // destroy current audio object
        await unload();

        // create the audio object
        const sound = new Audio.Sound();
        audioObject.current = sound;

        // load the next audio resource
        const initialStatus = {};
        const downloadFirst = true;
        sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
        await sound.loadAsync(nextAudioResource.current, initialStatus, downloadFirst);

        // always check if the component is still mounted on async operations
        if (!isMounted.current) {
          return;
        }

        // if the user wants to play the audio automatically, play it
        if (componentSettings.autoPlay) {
          setIsPlaying(true);
        }
      } finally {
        // always check if the component is still mounted on async operations
        if (!isMounted.current) {
          return;
        }

        // update the queue and free it for next resources
        currentAudioResource.current = nextAudioResource.current;
        nextAudioResource.current = null;
        isReadyForNextResource.current = true;

        // update loading status
        setIsLoadingAudio(false);
      }
    }

    // user wants to change the audio resource while the previous one is still being loaded
    // cancel the current loading and create a new audio object
    if (isLoadingAudio) {
      // expo-av limitation: there's no way to cancel an already loading audio resource
      // as a workaround, we wait for the song be loaded and then we destroy it
      // the best way to detect the song has finished loading, is through `onPlaybackStatusUpdate`
      isReadyForNextResource.current = false;

      // safe guard to not call the audio object if not initialized
      if (!audioObject.current) {
        return;
      }

      // wait song to be loaded, destroy it, and load the next in queue
      audioObject.current.setOnPlaybackStatusUpdate(async () => {
        await createAudioObjectFromQueue();
      });
      return;
    }

    // normal flow: user changed audio resource, no loading in progress.
    createAudioObjectFromQueue();
  }, [
    audioResource,
    componentSettings.autoPlay,
    isLoadingAudio,
    isResourceDefined,
    onPlaybackStatusUpdate,
    unload,
  ]);

  // change the audio position
  const seek = useCallback(async (positionMs) => {
    await audioObject.current.setPositionAsync(positionMs);
  }, []);

  // pause the audio
  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // play the audio
  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  // callbacks
  const setOnPlaybackTimeUpdate = useCallback((callback) => {
    userOnPlaybackTimeUpdate.current = callback;
  }, []);

  const setOnPlaybackStatusUpdate = useCallback((callback) => {
    userOnPlaybackStatusUpdate.current = callback;
  }, []);

  return {
    play,
    pause,
    seek,
    unload,
    isPlaying,
    setIsPlaying,
    isLoadingAudio,
    setOnPlaybackStatusUpdate,
    setOnPlaybackTimeUpdate,
  };
}

export default useAudio;
