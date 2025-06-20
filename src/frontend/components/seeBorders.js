import { SEE_BORDERS } from "../../resources/properties";

/**
 * Border styling utility that conditionally applies visual borders to components
 *
 * This style can be applied to any component accepting xcss props, primarily Box components.
 * The border visibility is controlled by the SEE_BORDERS environment flag.
 *
 * @type {Object} Style object for component borders (not xcss wrapped)
 * @example
 * // Apply border to a Box component
 * <Box xcss={xcss({ ...boxBorderStyle })}>Content</Box>
 *
 * // Apply border along with other styles
 * <Box xcss={xcss({ padding: "space.200", ...boxBorderStyle })}>Content</Box>
 */
const boxBorderStyle = SEE_BORDERS
  ? {
      borderColor: "color.border.accent.purple",
      borderWidth: "border.width",
      borderStyle: "solid",
      borderRadius: "border.radius",
    }
  : {}; // Empty object when SEE_BORDERS is false

export default boxBorderStyle;
