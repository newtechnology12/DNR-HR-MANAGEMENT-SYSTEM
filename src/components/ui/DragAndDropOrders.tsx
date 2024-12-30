import { FC, useState, useCallback, HTMLAttributes, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  DragOverlay,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import OrderCard from "@/components/shared/OrderCard";

export const DragAndDropOrders: FC = ({
  data,
  isDraggable,
  params,
  selectedStatus,
  ticktesQuery,
  queryKey
}: any) => {
  const [items, setItems] = useState(data);
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = useState<any>(null);
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

  const handleNotifictionIcon = (id) =>{
    queryClient.setQueriesData(queryKey, (prev: any) => {
      return prev.map((e: any) => {
        if (e.id === id) {
          return {
            ...e,
            isNew: false,
          };
        }
        return e;
      });
    });
  }
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  useEffect(() => {
    setItems(data);
  },[JSON.stringify(data)])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((itm) => itm.id === active.id);
        const newIndex = items.findIndex((itm) => itm.id === over?.id);
        const newArrayWithPositionMoved = items?.map((itm) => {
          if (itm.id === over?.id) {
            // @ts-ignore
            pocketbase.collection("order_tickets").update(over?.id, {
              arrangCounter: items[oldIndex].arrangCounter,
            });
            return { ...itm, arrangCounter: items[oldIndex].arrangCounter };
          }
          if (itm.id === active.id) {
            // @ts-ignore
            pocketbase.collection("order_tickets").update(active?.id, {
              arrangCounter: items[newIndex].arrangCounter,
            });
            return { ...itm, arrangCounter: items[newIndex].arrangCounter };
          }

          return itm;
        });
        const result = arrayMove(newArrayWithPositionMoved, oldIndex, newIndex);
        queryClient.setQueriesData(
          ["kitchen-displays-tickets", params.kitchen, selectedStatus],
          result
        );
        return result;
      });
    }

    setActiveId(null);
  };
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items} strategy={rectSortingStrategy}>
        {/* px-3 py-2 gap-x-3 columns-1  xs:columns-2 md:columns-3 lg:columns-4 col */}
        <div className="px-3 py-2 gap-x-3 columns-1  xs:columns-2 md:columns-3 lg:columns-4 col">
          {isDraggable
            ? items.map((itm) => (
                <SortableItem
                  key={itm.id}
                  id={itm.id}
                  ticktesQuery={ticktesQuery}
                  handleNotifictionIcon={handleNotifictionIcon}
                  order={itm}
                />
              ))
            : items.map((itm) => (
                <OrderCard
                  key={itm.id}
                  ticktesQuery={ticktesQuery}
                  order={itm}
                  handleNotifictionIcon={handleNotifictionIcon}
                />
              ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <OrderCard
            ticktesQuery={ticktesQuery}
            order={items.find((itm) => itm.id === activeId)}
            id={activeId}
            handleNotifictionIcon={handleNotifictionIcon}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/utils";
import { useQueryClient } from "react-query";
import pocketbase from "@/lib/pocketbase";

export const SortableItem = (props: any) => {
  const {
    isDragging,
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      className={cn({
        "opacity-70": isDragging,
      })}
    >
      <OrderCard
        ref={setNodeRef}
        style={style}
        withOpacity={isDragging}
        {...props}
        {...attributes}
        handleNotifictionIcon={props.handleNotifictionIcon}
        {...listeners}
        ticktesQuery={props.ticktesQuery}
        order={props.order}
        isDragging
      />
    </div>
  );
};

export type ItemProps = HTMLAttributes<HTMLDivElement> & {
  id: string;
  withOpacity?: boolean;
  isDragging?: boolean;
};
