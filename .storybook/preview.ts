import type { Preview } from "@storybook/react-vite";
import { withRouter, reactRouterParameters } from "storybook-addon-remix-react-router";
import "../src/global.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    reactRouter: reactRouterParameters({}),
  },
  decorators: [withRouter],
};

export default preview;
