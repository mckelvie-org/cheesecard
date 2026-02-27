import TastingPage from "./TastingPage";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <TastingPage />;
}
