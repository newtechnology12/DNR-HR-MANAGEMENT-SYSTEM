import { useEffect } from "react";
import soundOne from "./order.mp3";

export default function OrderSound({ notification }: { notification: number }) {
  const aud = new Audio(soundOne);
 
  useEffect(() => {
    if (notification >= 1) {
      aud.play();
      aud.muted = false;
      aud.loop = true;
    } else {
      aud.pause();
      aud.loop = false;
      aud.muted = true;
    }
    return () => {
      aud.pause();
      aud.loop = false;
      aud.muted = true;
    };
  }, [notification]);

  if (window) return <div />;
}
