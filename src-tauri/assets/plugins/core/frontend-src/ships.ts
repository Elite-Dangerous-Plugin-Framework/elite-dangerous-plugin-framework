import { stringifyBigIntJSON } from "@elite-dangerous-plugin-framework/journal";
import { type LoadoutEvent_BI } from "@elite-dangerous-plugin-framework/journal";

export async function calculateSLEFImportData(
  shipBuild: LoadoutEvent_BI,
  version: string,
) {
  const payload = [
    {
      header: {
        appName: "elite-dangerous-plugin-framework",
        appVersion: version,
      },
      data: shipBuild,
    },
  ];
  const serializedPayload = stringifyBigIntJSON(payload);
  console.log({ serializedPayload, payload });
  // We spawn a text Decoder. This turns our JSON string into the respective UTF8 binary representation
  const textDecoder = new TextEncoder();
  const binaryPayload = textDecoder.encode(serializedPayload);
  // this is then run through gzip, according to coriolis' spec
  const compressionStream = new CompressionStream("gzip");
  const compressedStream = new Blob([binaryPayload])
    .stream()
    .pipeThrough(compressionStream);
  // the result is collected into an ArrayBuffer
  const compressedPayload = await new Response(compressedStream).bytes();
  // from here the binary, compressed payload is encoded as URI-safe base64
  const result = encodeURIComponent(compressedPayload.toBase64());
  return result;
}
