import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { mimeTypeForAudioPath } from "@/lib/audio-mime";

// Serves generated episode audio with Range support — podcast apps rely on
// this for scrubbing and resuming partial downloads.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const episode = await prisma.episode.findUnique({ where: { id } });
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  let size: number;
  try {
    size = (await stat(episode.audioPath)).size;
  } catch {
    return NextResponse.json({ error: "Audio file missing on disk" }, { status: 404 });
  }

  const contentType = mimeTypeForAudioPath(episode.audioPath);

  const range = req.headers.get("range");
  if (!range) {
    const stream = Readable.toWeb(createReadStream(episode.audioPath)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  // Only a single range is supported; anything malformed, empty
  // ("bytes=-"), backwards, or starting past EOF gets a 416 rather than
  // NaN/negative offsets reaching createReadStream.
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  const rangeStart = match?.[1] ?? "";
  const rangeEnd = match?.[2] ?? "";

  let start = NaN;
  let end = NaN;
  if (rangeStart === "" && rangeEnd !== "") {
    // Suffix range, e.g. "bytes=-500" — the last 500 bytes of the file.
    const suffixLength = parseInt(rangeEnd, 10);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else if (rangeStart !== "") {
    start = parseInt(rangeStart, 10);
    // An end past EOF is legal and just means "to the end".
    end = rangeEnd ? Math.min(parseInt(rangeEnd, 10), size - 1) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const chunkSize = end - start + 1;

  const stream = Readable.toWeb(
    createReadStream(episode.audioPath, { start, end }),
  ) as ReadableStream;

  return new NextResponse(stream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
