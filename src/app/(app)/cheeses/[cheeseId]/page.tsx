import CheesePage from "./CheesePage";

export async function generateStaticParams() {
  return [{ cheeseId: "placeholder" }];
}

export default function Page() {
  return <CheesePage />;
}
