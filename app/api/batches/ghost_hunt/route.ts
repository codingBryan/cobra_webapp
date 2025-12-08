import { fetchBatchData, findGhostInputs,filterAndSaveMissingInputTradeBatches, findAndSaveMissingHedgeBatches  } from '@/lib/stack_pricing_utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // const data = await findGhostInputs();
        const _ = await findAndSaveMissingHedgeBatches();
        return NextResponse.json({ status: 200 });
    } catch (error) {
        console.error("Failed to hunt ghosts:", error);
        return NextResponse.json({ error: "Failed to Ghost hunt" }, { status: 500 });
    }
}