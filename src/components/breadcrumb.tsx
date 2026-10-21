import { Breadcrumb } from "@/components/ims";

type BreadCrumbType = {
  title: string;
  link: string;
};

type BreadCrumbPropsType = {
  items: BreadCrumbType[];
};

/** "Dashboard › Module › Page" — the ims Breadcrumb (the last item is the current page, not a link). */
export default function BreadCrumb({ items }: BreadCrumbPropsType) {
  return <Breadcrumb items={(items || []).map((i) => ({ label: i.title, to: i.link }))} className="mb-1" />;
}
