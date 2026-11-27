// A value along a range, dragged 1:1: nsh/base's Slider, its track and range drawn as the ProgressBar is.
import { Slider as BaseSlider } from "nsh/base";
import { WASH } from "./motion";

export function Slider(props: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  logarithmic?: boolean;
  label: string;
  testID?: string;
}) {
  return (
    <BaseSlider
      value={props.value}
      onChange={(e) => props.onChange(e.value as number)}
      min={props.min}
      max={props.max}
      step={props.step}
      scale={props.logarithmic ? "logarithmic" : "linear"}
      accessibilityLabel={props.label}
      testID={props.testID}
      class="h-5 justify-center"
      trackClass="h-1.5 rounded-full bg-muted"
      rangeClass="h-1.5 rounded-full bg-primary"
      thumbClass={`size-3.5 rounded-full border border-primary bg-foreground ${WASH} hover:bg-primary-foreground focus-visible:ring-2 focus-visible:ring-ring`}
    />
  );
}
