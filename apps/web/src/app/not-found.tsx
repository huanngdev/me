import { ErrorScreen } from "@repo/core/components/layouts/error-screen";

export default function NotFound() {
  return (
    <ErrorScreen
      code={404}
      message="Page not found"
      description="The page you're looking for doesn't exist or has moved."
    />
  );
}
