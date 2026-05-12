declare module "dicom-parser" {
  export type DataSet = {
    byteArray: Uint8Array;
    elements: Record<string, { dataOffset: number; length: number; vr?: string }>;
    string(tag: string): string | undefined;
    uint16(tag: string): number;
    int16(tag: string): number;
  };

  export function parseDicom(byteArray: Uint8Array): DataSet;
}
