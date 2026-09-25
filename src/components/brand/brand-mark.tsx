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
        preload={priority}
      unoptimized
        className="h-16 w-auto object-contain"
      />
    );
  }

  return (
    <Image
      src="/brand/omix-mark.png"
      alt="Omix"
      width={2000}
      height={2000}
      preload={priority}
      unoptimized
      className="h-11 w-11 object-contain"
    />
  );
}
