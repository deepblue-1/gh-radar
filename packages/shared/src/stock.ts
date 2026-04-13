export type Market = "KOSPI" | "KOSDAQ";

export type Stock = {
  code: string;
  name: string;
  market: Market;
  price: number;
  changeAmount: number;
  changeRate: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  marketCap: number;
  upperLimit: number;
  lowerLimit: number;
  updatedAt: string;
};
