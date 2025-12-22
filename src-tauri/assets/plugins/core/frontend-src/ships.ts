import type LoadoutEvent_BI from "@elite-dangerous-plugin-framework/journal/dist/generated/Loadout.bi";

function serializeJsonWithBigInt(input: object) {
  const bigIntPrefix = "BIGINT_";
  const bigIntSuffix = "_BIGINT";
  const jsonWithMarkers = JSON.stringify(input, (_, val) => {
    if (typeof val !== "bigint") {
      return val;
    }
    return bigIntPrefix + val.toString() + bigIntSuffix;
  });

  // this turns
  // {
  //   "systemAddress": "BIGINT_12345_BIGINT"
  // }
  // into
  // {
  //   "systemAddress": 12345
  // }
  // such that the consumer can handle it as a number or do some special stuff to handle as BigInt also
  return jsonWithMarkers
    .replaceAll(`"${bigIntPrefix}`, "")
    .replaceAll(`${bigIntSuffix}"`, "");
}

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
  // @ts-expect-error modern browsers support this: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
  const result = encodeURIComponent(compressedPayload.toBase64());
  return result;
}
