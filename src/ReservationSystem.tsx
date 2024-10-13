'use client'

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

type Reservation = {
  name: string
  service: 'メイク' | '着付け' | ''
}

type ReservationData = {
  [day: string]: {
    [timeSlot: string]: Reservation
  }
}

const timeSlots = [
  "17:00-17:10", "17:10-17:20", "17:20-17:30", "17:30-17:40", "17:40-17:50", "17:50-18:00",
  "18:00-18:10", "18:10-18:20", "18:20-18:30", "18:30-18:40", "18:40-18:50", "18:50-19:00",
  "19:00-19:10", "19:10-19:20", "19:20-19:30", "19:30-19:40", "19:40-19:50", "19:50-20:00",
  "20:00-20:10", "20:10-20:20", "20:20-20:30", "20:30-20:40", "20:40-20:50", "20:50-21:00"
]

const days = ["月", "火", "水", "木", "金", "土"]

const getWeekDates = () => {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(monday.getDate() - (monday.getDay() - 1));
  return days.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
};

export default function ReservationSystem() {
  const [reservations, setReservations] = useState<ReservationData>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const [currentDate, setCurrentDate] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [name, setName] = useState('')
  const [service, setService] = useState<'メイク' | '着付け' | ''>('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [cancelDay, setCancelDay] = useState('')
  const [cancelTime, setCancelTime] = useState('')
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [weekDates, setWeekDates] = useState(getWeekDates());

  useEffect(() => {
    fetchReservations();
    setupSSE();

    const timer = setInterval(() => {
      const now = new Date()
      setCurrentTime(now)
      setCurrentDate(now.toLocaleDateString('ja-JP', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      setWeekDates(getWeekDates())
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  const fetchReservations = async () => {
    try {
      const response = await fetch('/api/reservations');
      const data = await response.json();
      setReservations(data);
    } catch (error) {
      console.error('Failed to fetch reservations:', error);
    }
  };

  const setupSSE = () => {
    const eventSource = new EventSource('/api/sse');
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setReservations(data);
    };
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };
    return () => {
      eventSource.close();
    };
  };

  const updateReservations = async (newReservations: ReservationData) => {
    try {
      await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newReservations),
      });
    } catch (error) {
      console.error('Failed to update reservations:', error);
    }
  };

  const canModifyReservation = (selectedDate: Date) => {
    if (isAdmin) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (selectedDate.getTime() === today.getTime()) {
      return now.getHours() < 17;
    } else if (selectedDate.getTime() < today.getTime()) {
      return false;
    } else if (selectedDate.getTime() === tomorrow.getTime()) {
      return false;
    }
    return true;
  }

  const handleCellClick = (day: string, time: string) => {
    const selectedDate = weekDates[days.indexOf(day)];
    if (!canModifyReservation(selectedDate)) {
      alert("この日時の予約の変更はできません。");
      return;
    }

    setSelectedDay(day)
    setSelectedTime(time)
    const slot = timeSlots.find(slot => slot.startsWith(time))
    if (slot && reservations[day][slot].name) {
      setIsCancelDialogOpen(true)
    } else {
      setIsDialogOpen(true)
    }
  }

  const makeReservation = async () => {
    if (!name || !service) {
      alert("名前とサービスを選択してください。")
      return
    }

    const slot = timeSlots.find(slot => slot.startsWith(selectedTime))
    if (!slot) return

    const slotIndex = timeSlots.indexOf(slot)

    if (reservations[selectedDay][slot].name) {
      alert("この時間枠は既に予約されています。")
      return
    }

    let newReservations = { ...reservations };

    if (service === "着付け") {
      if (slotIndex === timeSlots.length - 1) {
        alert("着付けの予約には2つの連続した時間枠が必要です。この時間では予約できません。")
        return
      }
      const nextSlot = timeSlots[slotIndex + 1]
      if (reservations[selectedDay][nextSlot].name) {
        alert("着付けには2つの連続した時間枠が必要ですが、次の時間枠は既に予約されています。")
        return
      }

      newReservations = {
        ...newReservations,
        [selectedDay]: {
          ...newReservations[selectedDay],
          [slot]: { name, service },
          [nextSlot]: { name, service }
        }
      };
    } else {
      newReservations = {
        ...newReservations,
        [selectedDay]: {
          ...newReservations[selectedDay],
          [slot]: { name, service }
        }
      };
    }

    await updateReservations(newReservations);

    setIsDialogOpen(false)
    setName('')
    setService('')
    alert(service === "着付け" ? "着付けの予約が完了しました。2つの連続した時間枠（20分）が予約されました。" : "予約が完了しました。")
  }

  const cancelReservation = async () => {
    const selectedDate = weekDates[days.indexOf(selectedDay)];
    if (!canModifyReservation(selectedDate)) {
      alert("この日時の予約のキャンセルはできません。");
      setIsCancelDialogOpen(false);
      return;
    }

    const slot = timeSlots.find(slot => slot.startsWith(selectedTime))
    if (!slot) return

    const currentReservation = reservations[selectedDay][slot]
    
    let newReservations = { ...reservations };
    newReservations[selectedDay][slot] = { name: "", service: "" };
    
    // If it's a kimono reservation, cancel the next slot too
    if (currentReservation.service === "着付け") {
      const nextSlot = timeSlots[timeSlots.indexOf(slot) + 1]
      if (nextSlot && newReservations[selectedDay][nextSlot].name === currentReservation.name) {
        newReservations[selectedDay][nextSlot] = { name: "", service: "" }
      }
    }

    await updateReservations(newReservations);

    setIsCancelDialogOpen(false)
    alert("予約がキャンセルされました。")
  }

  const adminCancelReservation = async () => {
    if (adminPassword !== 'eiru') {
      alert("管理者パスワードが正しくありません。")
      return
    }
    setIsAdmin(true)
    if (!days.includes(cancelDay) || !timeSlots.some(slot => slot.startsWith(cancelTime))) {
      alert("無効な曜日または時間です。")
      return
    }
    const slot = timeSlots.find(slot => slot.startsWith(cancelTime))
    if (!slot || !reservations[cancelDay][slot].name) {
      alert("この時間枠に予約はありません。")
      return
    }

    let newReservations = {
      ...reservations,
      [cancelDay]: {
        ...reservations[cancelDay],
        [slot]: { name: "", service: "" }
      }
    };

    await updateReservations(newReservations);

    alert("予約がキャンセルされました。")
    setAdminPassword('')
    setCancelDay('')
    setCancelTime('')
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">ヘアメイク・着付け予約</h1>
      <div className="mb-4 text-center">{currentDate}</div>
      <div className="mb-4 text-center">{currentTime.toLocaleTimeString()}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>時間</TableHead>
            {days.map((day, index) => (
              <TableHead key={day}>
                <div>{day}</div>
                <div className="text-sm text-muted-foreground">{weekDates[index].getDate()}日</div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {timeSlots.map((slot, index) => (
            <TableRow key={slot}>
              <TableCell>{slot}</TableCell>
              {days.map(day => {
                const reservation = reservations[day]?.[slot]
                const cellClass = reservation?.name
                  ? reservation.service === "着付け"
                    ? "bg-yellow-200 cursor-pointer"
                    : "bg-red-200 cursor-pointer"
                  : "bg-green-200 cursor-pointer"
                const cellContent = reservation?.name || "空き"
                return (
                  <TableCell
                    key={`${day}-${slot}`}
                    className={cellClass}
                    onClick={() => handleCellClick(day, slot.split('-')[0])}
                  >
                    {cellContent}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>予約</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                名前
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="service" className="text-right">
                サービス
              </Label>
              <div className="col-span-3 flex gap-4">
                <Button
                  onClick={() => setService('メイク')}
                  variant={service === 'メイク' ? 'default' : 'outline'}
                >
                  メイク
                </Button>
                <Button
                  onClick={() => setService('着付け')}
                  
                  variant={service === '着付け' ? 'default' : 'outline'}
                >
                  着付け
                </Button>
              </div>
            </div>
          </div>
          <Button onClick={makeReservation}>予約する</Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予約のキャンセル</AlertDialogTitle>
            <AlertDialogDescription>
              この予約をキャンセルしますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>いいえ</AlertDialogCancel>
            <AlertDialogAction onClick={cancelReservation}>はい</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-8">
        <h3 className="text-xl font-bold mb-4">キャンセル (管理者用)</h3>
        <div className="grid gap-4">
          <Input
            type="password"
            placeholder="管理者パスワード"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <Input
            placeholder="曜日 (月-土)"
            value={cancelDay}
            onChange={(e) => setCancelDay(e.target.value)}
          />
          <Input
            placeholder="時間 (HH:MM)"
            value={cancelTime}
            onChange={(e) => setCancelTime(e.target.value)}
          />
          <Button onClick={adminCancelReservation}>キャンセルする</Button>
        </div>
      </div>
    </div>
  )
}