import { fetchSaleRecords, process_sale_record, updateSaleDifferential } from '@/lib/stack_pricing_utils';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }


    await process_sale_record(file);

    return NextResponse.json({ message: 'Sale record processed successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error processing sale record:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const salesData = await fetchSaleRecords();
    return NextResponse.json(salesData);
  } catch (error) {
    console.error('Error fetching sales records:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, sale_differential } = body;

    if (!id || sale_differential === undefined || sale_differential === null) {
      return NextResponse.json({ error: 'ID and Sale Differential are required' }, { status: 400 });
    }

    const success = await updateSaleDifferential(id, Number(sale_differential));

    if (success) {
        return NextResponse.json({ message: 'Sale differential updated successfully' }, { status: 200 });
    } else {
        return NextResponse.json({ error: 'Record not found or update failed' }, { status: 404 });
    }

  } catch (error) {
    console.error('Error processing sale update:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}