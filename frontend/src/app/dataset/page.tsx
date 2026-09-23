import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { DatasetExplorer } from "@/components/dataset-explorer";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Датасет подрядчиков — HackAlem",
  description: "Анонимизированные настоящие и синтетические профили подрядчиков HackAlem.",
};

export default function DatasetPage() {
  return <Providers><div className="min-h-screen bg-background"><AppHeader /><DatasetExplorer /></div></Providers>;
}
