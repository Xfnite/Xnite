import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("ginger_access_token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { annotate_id, register_hours, start_of_cycle, end_of_cycle } = body;

    if (!annotate_id) {
      return NextResponse.json({ success: false, error: "Missing annotate_id" }, { status: 400 });
    }

    const GINGER_API_URL = process.env.NEXT_PUBLIC_GINGER_API_URL || 'https://ginger.bitmappro.com';

    // Call the register-worktime API
    const registerResponse = await fetch(`${GINGER_API_URL}/bac/mapping/annotate/register-worktime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        annotate_id,
        register_hours,
        start_of_cycle,
        end_of_cycle
      }),
    });

    const responseText = await registerResponse.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse register response:", responseText);
      return NextResponse.json(
        { success: false, error: "Invalid response from server", details: responseText },
        { status: 502 }
      );
    }

    if (!registerResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Ginger API returned ${registerResponse.status}`, details: data },
        { status: registerResponse.status }
      );
    }

    // Checking if the data has an error code
    const hasError =
      (data.errcode !== undefined && data.errcode !== 0) ||
      (data.code !== undefined && data.code !== 0) ||
      (data.status !== undefined && data.status !== 'success') ||
      (data.success !== undefined && data.success === false) ||
      data.error;

    if (hasError) {
       return NextResponse.json(
         { success: false, error: data.errmesg || data.message || data.error || "Failed to register worktime", details: data },
         { status: 400 }
       );
    }

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("Register API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
