import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CHARS = 5000; // Google Cloud TTS request limit is 5000 bytes of input

/** Lets the client check whether Google Cloud TTS is available without making a synth request. */
export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.GOOGLE_TTS_API_KEY) });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Google Cloud TTS isn't configured on this server. Set the GOOGLE_TTS_API_KEY environment variable, or switch to the browser narration engine.",
      },
      { status: 501 }
    );
  }

  let body: { text?: string; voiceName?: string; languageCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const voiceName = body.voiceName ?? "";
  const languageCode = body.languageCode ?? "";

  if (!text) {
    return NextResponse.json({ error: "No text provided." }, { status: 400 });
  }
  if (!voiceName || !languageCode) {
    return NextResponse.json({ error: "No voice selected." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: "This sentence is too long for Google Cloud TTS. Try shortening it." },
      { status: 413 }
    );
  }

  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Google TTS error", data);
      return NextResponse.json(
        { error: data?.error?.message ?? "Google Cloud TTS request failed." },
        { status: res.status === 429 ? 429 : 502 }
      );
    }

    if (!data.audioContent) {
      return NextResponse.json({ error: "Google Cloud TTS returned no audio." }, { status: 502 });
    }

    return NextResponse.json({ audioContent: data.audioContent });
  } catch (err) {
    console.error("tts/google error", err);
    return NextResponse.json(
      { error: "Couldn't reach Google Cloud TTS. Please check your connection and try again." },
      { status: 502 }
    );
  }
}
