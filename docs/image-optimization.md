# Image Optimization

The Epic Stack uses [openimg](https://github.com/andrelandgraf/openimg) to
optimize images on demand, introduced via
[this decision doc](./decisions/041-image-optimization.md).

## Server Part

The [/resources/images](../app/routes/resources/images.tsx) endpoint accepts the
search parameters `src`, `w` (width), `h` (height), `format`, and `fit` to
perform image transformations and serve optimized variants. The Worker sends
validated transformation options to Cloudflare Image Transformations and stores
successful immutable responses in the Cloudflare Cache API. No application
filesystem or Sharp runtime is used.

## Client Part

On the client side, the `Img` React component from openimg/react is used to
query the [/resources/images](../app/routes/resources/images.tsx) endpoint with
the appropriate query parameters, including the source image string. The
component renders a picture element that requests modern formats and sets
attributes such as `fetchpriority`, `loading`, and `decoding` to optimize image
loading. It also computes `srcset` and `sizes` based on the provided `width` and
`height` props. Use the `isAboveFold` prop on the `Img` component to priotize
images that should load immediately.

## Image Sources

Uploaded images are retrieved from private Amazon S3 objects through 60-second
signed URLs. A `src` parameter is accepted only for same-origin static assets;
arbitrary external image origins and nested optimizer requests are rejected.
