import { ErrorScreen } from "@repo/core/components/layouts/error-screen";

export default function ProjectNotFound() {
  return (
    <ErrorScreen
      code={404}
      message="Project not found"
      description="The project you're looking for doesn't exist or was removed."
    />
  );
}
