import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bdt, monthText } from "./types";

interface MonthlyTrendChartProps {
  trend: Array<{
    monthKey: string;
    income: number;
    expense: number;
  }>;
}

export function MonthlyTrendChart({ trend }: MonthlyTrendChartProps) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <p className="section-kicker">মাসিক প্রবণতা</p>
      <h2 className="section-title">গত ৬ মাসের আয় ও ব্যয়</h2>
      <div className="mt-5 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend}>
            <CartesianGrid vertical={false} stroke="#e3ebe5" />
            <XAxis
              dataKey="monthKey"
              tickFormatter={monthText}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={value => `৳${value}`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={value =>
                bdt(
                  Array.isArray(value)
                    ? (value[0] ?? 0)
                    : (value ?? 0)
                )
              }
              labelFormatter={label =>
                `${monthText(String(label))} মাস`
              }
            />
            <Bar
              dataKey="income"
              name="আয়"
              fill="#1c7c54"
              radius={[7, 7, 0, 0]}
            />
            <Bar
              dataKey="expense"
              name="ব্যয়"
              fill="#ec8c7f"
              radius={[7, 7, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
