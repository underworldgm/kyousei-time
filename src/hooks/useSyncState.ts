import { useSyncExternalStore } from "react";
import { getSyncState, subscribeSync } from "../lib/sync";

export const useSyncState = () => useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
