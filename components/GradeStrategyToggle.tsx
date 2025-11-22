import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

export function GradeStrategyToggle() {
  return (
    <NativeSelect>
      <NativeSelectOption value="grade">Grades</NativeSelectOption>
      <NativeSelectOption value="strategy">Strategies</NativeSelectOption>
    </NativeSelect>
  )
}
