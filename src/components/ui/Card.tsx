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
        // سطحٌ **دلاليّ** لا لونٌ يُعاد تعيينه ليلياً: `--surface` و
        // `--border-subtle` معرَّفان لكلّ سمةٍ مرّةً في `globals.css`، فلا
        // تحتاج البطاقةُ قاعدةَ `.dark .bg-white { … !important }` العالمية.
        // القيم مطابقةٌ حرفياً لما كانت تُعطيه تلك القاعدة (أبيض/‏#241c12).
        // هذه أوّلُ خطوةٍ في هجرةٍ تدريجية — راجع التعليق عند `:root` هناك.
        "bg-[var(--surface)] rounded-2xl card-shadow border border-[var(--border-subtle)] p-4 transition-shadow duration-300",
        onClick && "cursor-pointer press hover:shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}
