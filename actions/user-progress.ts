"use server"

import { POINTS_TO_REFILL } from "@/constants"
import db from "@/db/drizzle"
import { getCourseById, getUserProgress, getUserSubs } from "@/db/queries"
import { challengeProgress, challenges, userProgress } from "@/db/schema"
import { auth, currentUser } from "@clerk/nextjs"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export const upsertUserProgress = async (courseId: number) => {
    const { userId } = await auth()
    const user = await currentUser()

    if (!userId || !user) {
        throw new Error('Unauthorized')
    }

    const course = await getCourseById(courseId)

    if (!course) {
        throw new Error('Course not found')
    }

    if (!course.units.length || !course.units[0].lessons.length) {
        throw new Error('Course is empty')
    }

    const existingUserProgress = await getUserProgress()

    if (existingUserProgress) {
        await db.update(userProgress).set({
            activeCourseId: courseId,
            userName: user.firstName || "User",
            userImageSrc: user.imageUrl || '/logo.png'
        })

        revalidatePath('/courses')
        revalidatePath('/learn')
        redirect('/learn')
    }

    await db.insert(userProgress).values({
        userId,
        activeCourseId: courseId,
        userName: user.firstName || "User",
        userImageSrc: user.imageUrl || '/logo.png'
    })

    revalidatePath('/courses')
    revalidatePath('/learn')
    redirect('/learn')
}

export const reduceHearts = async (challengeId: number) => {
    const { userId } = await auth()

    if (!userId) {
        throw new Error('Unauthorized')
    }

    const currentUserProgress = await getUserProgress()
    const userSubs = await getUserSubs()

    const challenge = await db.query.challenges.findFirst({
        where: eq(challenges.id, challengeId)
    })

    if (!challenge) {
        throw new Error('Challenge not found')
    }

    const lessonId = challenge.lessonId

    const existingChallengeProgress = await db.query.challengeProgress.findFirst({
        where: and(
            eq(challengeProgress.userId, userId),
            eq(challengeProgress.challengeId, challengeId)
        )
    })

    const isPractice = !!existingChallengeProgress

    if (isPractice) {
        return { error: "practice" }
    }

    if (!currentUserProgress) {
        throw new Error("User progress not found")
    }

    if (userSubs?.isActive) {
        return { error: "subscription" }
    }

    if (currentUserProgress.hearts === 0) {
        return { error: "hearts" }
    }

    await db.update(userProgress).set({
        hearts: Math.max(currentUserProgress.hearts - 1, 0)
    }).where(
        eq(userProgress.userId, userId)
    )

    revalidatePath('/shop')
    revalidatePath('/learn')
    revalidatePath('/quests')
    revalidatePath('/leaderboard')
    revalidatePath(`/lesson/${lessonId}`)
}

export const refillHearts = async () => {
    const crrUserProgress = await getUserProgress()

    if (!crrUserProgress) {
        throw new Error('User progress not found')
    }

    if (crrUserProgress.hearts === 5) {
        throw new Error('Hearts are already full')
    }

    if (crrUserProgress.points < POINTS_TO_REFILL) {
        throw new Error('Not enough points')
    }

    await db.update(userProgress).set({
        hearts: 5,
        points: crrUserProgress.points - POINTS_TO_REFILL
    }).where(
        eq(userProgress.userId, crrUserProgress.userId)
    )

    revalidatePath('/shop')
    revalidatePath('/learn')
    revalidatePath('/quests')
    revalidatePath('/leaderboard')
}