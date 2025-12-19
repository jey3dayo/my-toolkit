import {
  afterEach,
  initialGlobals,
  parameters,
} from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/react-vite";
import preview from "./preview";

setProjectAnnotations([{ afterEach, initialGlobals, parameters }, preview]);
