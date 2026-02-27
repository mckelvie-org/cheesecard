import NewCheesePage from "./NewCheesePage";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <NewCheesePage />;
}
