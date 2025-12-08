import { fetchBatchData } from '@/lib/stack_pricing_utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const data = await fetchBatchData();
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Failed to fetch batch data:", error);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}