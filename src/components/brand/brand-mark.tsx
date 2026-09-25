import Image from "next/image";

export function BrandMark({
  variant = "mark",
  priority = false,
}: {
  variant?: "mark" | "wordmark";
  priority?: boolean;
}) {
  if (variant === "wordmark") {
    return (
      <Image
        src="/brand/omix-wordmark.png"
        alt="Omix Solutions"
        width={2000}
        height={1000}
        priority={priority}
        className="h-12 w-auto"
      />
    );
  }

  return (
    <Image
      src="/brand/omix-mark.jpg"
      alt="Omix"
      width={512}
      height={512}
      priority={priority}
      className="h-9 w-9"
    />
  );
}
