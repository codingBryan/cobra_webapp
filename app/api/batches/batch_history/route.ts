import { NextResponse } from 'next/server';
import { get_history_batch} from '@/lib/stack_pricing_utils';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const batchNumber = searchParams.get('id');

  if (!batchNumber) {
    return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 });
  }

  try {
    const historyBatch = await get_history_batch(batchNumber);

    if (!historyBatch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    return NextResponse.json(historyBatch);
  } catch (error) {
    console.error('Error fetching history batch:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}