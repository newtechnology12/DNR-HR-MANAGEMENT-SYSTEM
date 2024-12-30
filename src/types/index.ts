/* eslint-disable @typescript-eslint/no-explicit-any */
export type Order = {
  code: number;
  collectionId: string;
  collectionName: string;
  created: string;
  customer: string;
  customer_notes: string;
  guests: number;
  id: string;
  itemCount: number;
  items: [];
  kitchen_notes: string;
  payment_status: string;
  payments: any;
  status: string;
  subTotal: number;
  table: string;
  total: number;
  updated: string;
  waiter: string;
};


export interface MenuItem {
  availability: string;
  category: string;
  collectionId: string;
  collectionName: string;
  created: string;
  description: string;
  destination: string;
  id: string;
  image: string;
  name: string;
  options: null; // You might want to replace null with the actual type if options have a structure
  preparation_time: number;
  price: string;
  subCategory: string;
  updated: string;
  variants: null; // You might want to replace null with the actual type if variants have a structure
}


type Record = {
  arrangCounter: string;
  collectionId: string;
  collectionName: string;
  created: string;
  fired_at: string;
  id: string;
  items: string[];
  name: string;
  order: string;
  order_items: string[];
  order_station: string;
  status: string;
  updated: string;
};

export type EventRealtimeTickets = {
  record: Record;
  action: "create" | "update" | "delete";
};
