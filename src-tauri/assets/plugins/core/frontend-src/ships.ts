import type LoadoutEvent_BI from "@elite-dangerous-plugin-framework/journal/dist/generated/Loadout.bi";

export function serializeJsonWithBigInt(input: object) {
  const randomString = crypto.randomUUID();

  const bigIntPrefix = randomString + "_";
  const bigIntSuffix = "_" + randomString;
  const jsonWithMarkers = JSON.stringify(input, (_, val) => {
    if (typeof val !== "bigint") {
      return val;
    }
    return bigIntPrefix + val.toString() + bigIntSuffix;
  });

  // this turns
  // {
  //   "systemAddress": "someUUID_12345_someUUID"
  // }
  // into
  // {
  //   "systemAddress": 12345
  // }
  // such that the consumer can handle it as a number or do some special stuff to handle as BigInt also

  // we dont use a stable marker such as _BIGINT because this could lead to a payload being broken if said string actually appears (e.g. Ship Name).
  // random UUIDv4s are considered impropable to collide
  return jsonWithMarkers
    .replaceAll(`"${bigIntPrefix}`, "")
    .replaceAll(`${bigIntSuffix}"`, "");
}

export async function calculateSLEFImportData(
  shipBuild: LoadoutEvent_BI,
  version: string
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
  const serializedPayload = serializeJsonWithBigInt(payload);
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
