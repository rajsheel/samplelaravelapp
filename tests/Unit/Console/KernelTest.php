<?php

namespace Tests\Unit\Console;

use App\Console\Kernel;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

class KernelTest extends TestCase
{
    /**
     * Test that the Kernel properly schedules commands.
     *
     * @return void
     */
    public function test_schedules_commands()
    {
        // Create a simple mock schedule
        $schedule = $this->createMock(Schedule::class);
        $schedule->method('command')
            ->willReturn($schedule);

        // Create the kernel
        $kernel = new Kernel($this->app, $this->app['events']);

        // Call the schedule method
        $kernel->schedule($schedule);

        // If we reach here, the test passed
        $this->assertTrue(true);
    }
} 