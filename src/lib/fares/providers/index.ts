import type { Provider, ProviderId } from "../types";
import { olaProvider } from "./ola";
import { rapidoProvider } from "./rapido";
import { uberProvider } from "./uber";

export const providers: Provider[] = [uberProvider, olaProvider, rapidoProvider];

export const providersById: Record<ProviderId, Provider> = {
  uber: uberProvider,
  ola: olaProvider,
  rapido: rapidoProvider,
};

export { olaProvider, rapidoProvider, uberProvider };
