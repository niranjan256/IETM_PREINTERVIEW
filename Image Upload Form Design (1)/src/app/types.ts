export interface DocumentInfo {
  docId: string;
  title: string;
}

export interface HotspotData {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  desc: string;
  target: string;
}

export interface FigureData {
  id: string;
  number: string;
  title: string;
  graphicSrc: string;
  hotspots: HotspotData[];
}

export interface SectionInfo {
  id: string;
  number: string;
  title: string;
  level: number;
}

export interface FigureHotspotsPayload {
  figures: Record<string, HotspotData[]>;
}
