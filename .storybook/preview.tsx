import type { Preview } from "@storybook/react-vite";
import { ensurePopupUiBaseStyles } from "@/ui/styles";
import { applyTheme, isTheme } from "@/ui/theme";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "UI theme",
      defaultValue: "auto",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "auto", title: "Auto" },
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
  decorators: [
    (Story, context) => {
      ensurePopupUiBaseStyles(document);
      document.body.classList.add("is-extension");
      const theme = context.globals.theme;
      applyTheme(isTheme(theme) ? theme : "auto", document);
      return (
        <div
          className="mbu-surface"
          style={{ minHeight: "100vh", padding: 16 }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
