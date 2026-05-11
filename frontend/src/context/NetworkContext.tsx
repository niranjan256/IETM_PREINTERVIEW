import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { drainSyncQueue } from "@/lib/syncQueue";

interface NetworkContextValue {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true });

export function NetworkProvider({ children }: { children: ReactNode }) {
  
  const [isOnline] = useState(true);

  useEffect(() => {
    
    const interval = setInterval(() => {
      drainSyncQueue();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
