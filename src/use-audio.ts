import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Audio, AVPlaybackStatus, AVMetadata } from 'expo-av';
import useIsMounted from 'react-use/lib/useMountedState';

export interface AudioResource {
  uri: string;
}

export interface PlaybackTimeUpdateCallbackParams {
  positionMillis: number;
  durationMillis: number;
  remainingMillis: number;
}

export type PlaybackStatusUpdateCallbackParams = AVPlaybackStatus;

export interface Settings {
  autoPlay: true;
  onPlaybackTimeUpdate: (params: PlaybackTimeUpdateCallbackParams) => void;
  onPlaybackStatusUpdate: (params: PlaybackStatusUpdateCallbackParams) => void;
}

export interface UseAudioResult {
  isPlaying: boolean;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  isLoadingAudio: boolean;
  seek: (positionInMilliseconds: number) => Promise<void>;
  unload: () => Promise<void>;
  audioObject: Audio.Sound | null;
  metadata: AVMetadata | null;
  status: AVPlaybackStatus | null;
}

// check if two audio resources are the same
function checkSameAudioResources(
    resource1: AudioResource,
    resource2: AudioResource
) {
  if (!resource1 || !resource2) {
    return false;
  }

  const isResourcesStreaming = 'uri' in resource1 && 'uri' in resource2;
  if (isResourcesStreaming) {
    return resource1.uri === resource2.uri;
  }

  return resource1 === resource2;
}

function useAudio(
    audioResource: AudioResource,
    providedSettings: Partial<Settings> | undefined = undefined
): UseAudioResult {
  const {
    autoPlay,
    onPlaybackTimeUpdate: parentOnPlaybackTimeUpdate,
    onPlaybackStatusUpdate: parentOnPlaybackStatusUpdate,
  } = Object.assign(providedSettings || {}, {
    autoPlay: false,
  });
  const isMounted = useIsMounted();

  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bugWatchdogCounter, setBugWatchdogCounter] = useState<number>(0);
  const [metadata, setMetadata] = useState<AVMetadata | null>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);

  const audioObject = useRef<Audio.Sound | null>(null);
  const currentAudioResource = useRef<any>(null);
  const nextAudioResource = useRef<any>(null);
  const isReadyForNextResource = useRef<any>(true);

  // the expo-av bug watchdog
  // expo-av has a few bugs that cause the audio to not play or pause when requested.
  // this is a workaround that checks the audio status every n ms and force a play/pause action.
  useEffect(() => {
    const timerHandler = setInterval(() => {
      setBugWatchdogCounter((value) => value + 1);
    }, 500);

    return () => clearInterval(timerHandler);
  }, []);

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
    if (!isMounted) {
      return;
    }

    // clear the audio object
    audioObject.current = null;
    currentAudioResource.current = null;
  }, []);

  // unload audio when unmount the component
  useEffect(() => {
    unload();
  }, [unload]);

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

      // Check if audio is available
      if (!audioObject.current) {
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
  const onPlaybackStatusUpdate = useCallback(
      (status: AVPlaybackStatus) => {
        // provides the current playback time
        if (parentOnPlaybackTimeUpdate && status.isLoaded) {
          const positionMillis = status.positionMillis ?? 0;
          const durationMillis = Number.isNaN(status.durationMillis)
              ? 1
              : status.durationMillis ?? 1;
          const remainingMillis = durationMillis - positionMillis;
          parentOnPlaybackTimeUpdate({
            positionMillis,
            durationMillis,
            remainingMillis,
          });
        }

        parentOnPlaybackStatusUpdate?.(status);
      },
      [parentOnPlaybackTimeUpdate, parentOnPlaybackStatusUpdate]
  );

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
    const isSameResource = checkSameAudioResources(
        currentAudioResource.current,
        audioResource
    );
    if (isSameResource) {
      return;
    }

    // put resource in queue to be loaded next.
    const isAlreadyNext = checkSameAudioResources(
        nextAudioResource.current,
        audioResource
    );
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
        setStatus(null);

        // destroy current audio object
        await unload();

        // create the audio object
        const sound = new Audio.Sound();
        audioObject.current = sound;

        // load the next audio resource
        const initialStatus = {};
        const downloadFirst = true;
        sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
        sound.setOnMetadataUpdate(setMetadata);
        await sound.loadAsync(
            nextAudioResource.current,
            initialStatus,
            downloadFirst
        );
        setStatus(await sound.getStatusAsync());

        // always check if the component is still mounted on async operations
        if (!isMounted) {
          return;
        }

        // if the user wants to play the audio automatically, play it
        if (autoPlay) {
          setIsPlaying(true);
        }
      } finally {
        // always check if the component is still mounted on async operations
        if (!isMounted) {
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
    autoPlay,
    isLoadingAudio,
    isResourceDefined,
    onPlaybackStatusUpdate,
    unload,
  ]);

  // change the audio position
  const seek = useCallback(async (positionMs: number) => {
    if (!audioObject.current) {
      return;
    }

    await audioObject.current.setPositionAsync(positionMs);
  }, []);

  return {
    seek,
    unload,
    isPlaying,
    isLoadingAudio,
    metadata,
    status,
    audioObject: audioObject.current,
    setPlaying: setIsPlaying,
  };
}

export default useAudio;
