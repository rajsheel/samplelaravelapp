<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use Mockery;

/**
 * Base Test Case
 * 
 * This is the base test case class that all tests should extend.
 * It provides the foundation for testing Laravel applications.
 * 
 * The class extends the BaseTestCase from the Laravel testing package
 * and uses the CreatesApplication trait to bootstrap the application.
 */
abstract class TestCase extends BaseTestCase
{
    use CreatesApplication, MockeryPHPUnitIntegration;

    protected function setUp(): void
    {
        parent::setUp();
        Mockery::getConfiguration()->setConstantsMap([
            'Illuminate\Support\Facades\Auth' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
