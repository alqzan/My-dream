"use client";
import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Card({ className, children, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl card-shadow border border-gray-100 p-4 transition-shadow duration-300",
        onClick && "cursor-pointer press hover:shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}
