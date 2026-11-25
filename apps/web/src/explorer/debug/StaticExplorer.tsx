import type { ComponentType } from "react";
import type { useExplorer } from "../useExplorer";
import { useStaticExplorer } from "./useStaticExplorer";

export default function StaticExplorer({ View }: {
  View: ComponentType<{ ex: ReturnType<typeof useExplorer>; readOnly?: boolean }>;
}) {
  const ex = useStaticExplorer();
  return <View ex={ex} readOnly />;
}
