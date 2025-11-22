"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart"
import { StockSummary } from "@/custom_utilities/custom_types"


export const description = "A bar chart with negative values"



const chartConfig = {
  volume: {
    label: "volume (MT)",
  },
} satisfies ChartConfig

export function StockActivityChart(props:{activity_data:StockSummary | null}) {
  const chartData = [
    { item: "inbound", volume: props.activity_data?.total_inbound_qty },
    { item: "process input", volume: props.activity_data?.total_to_processing_qty },
    { item: "process output", volume:  props.activity_data?.total_from_processing_qty },
    { item: "outbound", volume:  props.activity_data?.total_outbound_qty },
    { item: "processing loss", volume:  props.activity_data?.total_loss_gain_qty },
    { item: "milling loss", volume:  props.activity_data?.milling_loss },
    { item: "adjustment", volume:  props.activity_data?.total_stock_adjustment_qty },
  ]

  return (
    
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel hideIndicator />}
            />
            <Bar dataKey="volume">
              <LabelList position="top" dataKey="item" fillOpacity={1} />
              {chartData.map((item) => (
                <Cell
                  key={item.item}
                  fill={item.volume != null && item.volume  > 0 ? "var(--chart-1)" : "var(--chart-2)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
  )
}
export { ChartTooltipContent }

